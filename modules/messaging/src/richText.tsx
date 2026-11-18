import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { Button, Space, Tooltip } from "antd";
import { BoldOutlined, ItalicOutlined, LinkOutlined, OrderedListOutlined, RedoOutlined, UnderlineOutlined, UndoOutlined, UnorderedListOutlined } from "@ant-design/icons";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import DOMPurify from "dompurify";
import { useTranslation } from "react-i18next";
import type { MentionCandidate } from "./feed/mentions";

// The rich text editor of both apps. Text: sanitized HTML in a text column (plain text without a leading tag shows its
// line breaks and becomes HTML on save). Variant "email": the NPM tool's email editor (npm-email richTextEditor.tsx),
// no headings, code or rules, unsanitized HTML (read in a sandboxed iframe), outside values reported via onNormalize.

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const isHtml = (value: string) => /^\s*<(p|h[1-6]|ul|ol|blockquote|pre|div)[\s>]/i.test(value);

export const toHtml = (value: string | null | undefined) => {
  if (!value) return "";
  if (isHtml(value)) return value;
  return value.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
};

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

export const sanitizeHtml = (html: string) =>
  DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, ALLOWED_TAGS: ["p", "br", "strong", "em", "u", "s", "h2", "h3", "ul", "ol", "li", "blockquote", "code", "pre", "hr", "a"], ALLOWED_ATTR: ["href", "target", "rel"] });

// A user's own mail signature (tables, images, inline styles are normal there): DOMPurify's HTML profile drops scripts,
// event handlers and javascript: URLs but keeps the layout, so the preview matches what is sent.
export const sanitizeSignatureHtml = (html: string) => DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });

// Editor output of an empty document is "<p></p>": store that as null.
const richTextToStored = (html: string) => {
  const clean = sanitizeHtml(html);
  const text = clean.replace(/<[^>]*>/g, "").trim();
  return text || /<hr/.test(clean) ? clean : null;
};

export const RichTextView = ({ value }: { value: string | null | undefined }) => {
  const html = useMemo(() => sanitizeHtml(toHtml(value)), [value]);
  if (!html) return null;
  return <div className="rich-text" dangerouslySetInnerHTML={{ __html: html }} />;
};

// One entry of the @-suggestions: what the list shows and the mention it stands for.
export type MentionOption = { key: string; label: string; candidate: MentionCandidate };

type EditorProps = {
  value?: string | null;
  placeholder?: string;
  autoFocus?: boolean;
  minHeight?: number;
  // "@" offers people (and the team); the pick is written as "@Name" and reported through onMention (stored via toStoredBody).
  mentionSearch?: (term: string) => Promise<MentionOption[]>;
  onMention?: (candidate: MentionCandidate) => void;
  // Gives the caller the editor (inserting an emoji at the caret).
  editorRef?: MutableRefObject<Editor | null>;
  // More buttons at the end of the toolbar (emoji, link a task).
  toolbarExtra?: ReactNode;
} & (
  // Text: onChange gets the sanitized HTML, null when empty.
  | { variant?: "text"; onChange?: (value: string | null) => void; onNormalize?: never }
  // Email: onChange gets the editor's HTML, "" when empty; an outside value rewritten by the schema comes back through
  // onNormalize (with the raw value), so the parent sends what the user sees.
  | { variant: "email"; onChange?: (html: string) => void; onNormalize?: (html: string, raw: string) => void }
);

export const RichTextEditor = ({
  value,
  onChange,
  placeholder,
  autoFocus,
  minHeight = 140,
  mentionSearch,
  onMention,
  editorRef,
  toolbarExtra,
  variant = "text",
  onNormalize,
}: EditorProps) => {
  const email = variant === "email";
  const { t } = useTranslation();
  const [suggest, setSuggest] = useState<{ from: number; to: number; options: MentionOption[]; index: number; left: number; top: number } | null>(null);
  const suggestRef = useRef(suggest);
  suggestRef.current = suggest;
  const searchRef = useRef(mentionSearch);
  searchRef.current = mentionSearch;
  const pickRef = useRef<(option: MentionOption) => void>(() => undefined);
  const seq = useRef(0);
  const editor = useEditor({
    extensions: [
      email
        ? StarterKit.configure({ heading: false, codeBlock: false, code: false, horizontalRule: false, strike: false, link: { openOnClick: false } })
        : StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: true } }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: email ? value || "<p></p>" : toHtml(value),
    autofocus: autoFocus ? "end" : false,
    onUpdate: ({ editor: e }) => {
      if (email) (onChange as ((html: string) => void) | undefined)?.(e.isEmpty ? "" : e.getHTML());
      else (onChange as ((value: string | null) => void) | undefined)?.(richTextToStored(e.getHTML()));
      void detectMention(e);
    },
    onSelectionUpdate: ({ editor: e }) => void detectMention(e),
    editorProps: {
      // While the list is open the arrow keys, Enter, Tab and Escape belong to it.
      handleKeyDown: (_view, event) => {
        const s = suggestRef.current;
        if (!s || s.options.length === 0) return false;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          const step = event.key === "ArrowDown" ? 1 : s.options.length - 1;
          setSuggest({ ...s, index: (s.index + step) % s.options.length });
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          pickRef.current(s.options[s.index]);
          return true;
        }
        if (event.key === "Escape") {
          setSuggest(null);
          return true;
        }
        return false;
      },
    },
  });
  if (editorRef) editorRef.current = editor;

  // Is the caret right behind "@word"? Then look the word up.
  async function detectMention(e: Editor) {
    const search = searchRef.current;
    if (!search) return;
    const { from, empty } = e.state.selection;
    const $from = e.state.doc.resolve(from);
    const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 40), $from.parentOffset, undefined, "\ufffc");
    const match = empty ? /(?:^|\s)@([^\s@]{0,30})$/.exec(before) : null;
    if (!match) return setSuggest(null);
    const mine = ++seq.current;
    const options = await search(match[1]);
    if (mine !== seq.current) return;
    if (options.length === 0) return setSuggest(null);
    const caret = e.view.coordsAtPos(from);
    setSuggest({ from: from - match[1].length - 1, to: from, options, index: 0, left: caret.left, top: caret.bottom + 4 });
  }
  pickRef.current = (option) => {
    const s = suggestRef.current;
    if (!editor || !s) return;
    editor.chain().focus().deleteRange({ from: s.from, to: s.to }).insertContent(`@${option.label} `).run();
    onMention?.(option.candidate);
    setSuggest(null);
  };

  // Reset when the form is cleared or another record is loaded; typing never reaches this branch (same content).
  useEffect(() => {
    if (!editor) return;
    if (email) {
      // An outside value replaces the content; the editor's own changes come back equal and are skipped.
      const current = editor.isEmpty ? "" : editor.getHTML();
      if ((value ?? "") !== current) {
        editor.commands.setContent(value || "<p></p>", { emitUpdate: false });
        const normalized = editor.isEmpty ? "" : editor.getHTML();
        if (value && normalized !== value) onNormalize?.(normalized, value);
      }
      return;
    }
    const stored = richTextToStored(editor.getHTML());
    if ((value || null) !== stored && !editor.isFocused) editor.commands.setContent(toHtml(value), { emitUpdate: false });
  }, [value, editor]);

  if (!editor) return null;

  const setLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt(t("richText.linkPrompt"), previous ?? "https://");
    if (url === null) return;
    if (url === "") editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };
  const btn = (key: string, icon: React.ReactNode, active: boolean, run: () => void) => (
    <Tooltip key={key} title={t(`richText.${key}`)}>
      <Button size="small" type={active ? "primary" : "text"} icon={icon} onClick={run} />
    </Tooltip>
  );

  return (
    <div className="rich-text-editor">
      <Space size={2} wrap className="rich-text-toolbar">
        {btn("bold", <BoldOutlined />, editor.isActive("bold"), () => editor.chain().focus().toggleBold().run())}
        {btn("italic", <ItalicOutlined />, editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run())}
        {btn("underline", <UnderlineOutlined />, editor.isActive("underline"), () => editor.chain().focus().toggleUnderline().run())}
        {!email && <Button size="small" type={editor.isActive("heading", { level: 2 }) ? "primary" : "text"} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H</Button>}
        {btn("bulletList", <UnorderedListOutlined />, editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run())}
        {btn("orderedList", <OrderedListOutlined />, editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run())}
        {btn("link", <LinkOutlined />, editor.isActive("link"), setLink)}
        {btn("undo", <UndoOutlined />, false, () => editor.chain().focus().undo().run())}
        {btn("redo", <RedoOutlined />, false, () => editor.chain().focus().redo().run())}
        {toolbarExtra}
      </Space>
      {/* Email: at most 40% of the screen high, then it scrolls (a quoted thread would push the Send button away). */}
      <EditorContent editor={editor} className="rich-text rich-text-content" style={email ? { minHeight, maxHeight: "40vh", overflowY: "auto" } : { minHeight }} />
      {suggest && (
        <div
          role="listbox"
          style={{ position: "fixed", left: suggest.left, top: suggest.top, zIndex: 1100, minWidth: 180, maxHeight: 240, overflowY: "auto", background: "var(--ant-color-bg-elevated, #fff)", border: "1px solid var(--ant-color-border-secondary, #eee)", borderRadius: 8, boxShadow: "0 6px 16px rgba(0,0,0,0.15)", padding: 4 }}
        >
          {suggest.options.map((o, i) => (
            <div
              key={o.key}
              role="option"
              aria-selected={i === suggest.index}
              onMouseDown={(ev) => {
                ev.preventDefault();
                pickRef.current(o);
              }}
              style={{ padding: "4px 10px", borderRadius: 6, cursor: "pointer", background: i === suggest.index ? "var(--ant-color-primary-bg, #e6f4ff)" : undefined }}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
