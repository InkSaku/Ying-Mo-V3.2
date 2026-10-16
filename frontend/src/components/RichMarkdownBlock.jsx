import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { CustomSelect } from "./CustomSelect";
import { useEditor, EditorContent } from "@tiptap/react";
import { richMarkdownExtensions, markdownPosition, editorPosition, mapTextOffset, preserveMarkdownBoundary } from "../lib/richMarkdown";

export default forwardRef(function RichMarkdownBlock({ value, onChange, onSelection, onFocus, onKeyDown, onPaste, placeholder, ariaLabel, ariaDescribedBy, spellCheck }, ref) {
  const propsRef = useRef({ value, onChange, onSelection, onFocus, onKeyDown, onPaste });
  propsRef.current = { value, onChange, onSelection, onFocus, onKeyDown, onPaste };
  const emittedRef = useRef(value);
  const editorRef = useRef(null);
  const [, refresh] = useState(0);
  const [linkDraft, setLinkDraft] = useState(null);
  const linkSelection = useRef(null);
  const selection = (editor) => {
    const markdown = editor.getMarkdown();
    return [editor.state.selection.from, editor.state.selection.to].map((position) => mapTextOffset(markdown, propsRef.current.value, markdownPosition(editor, position, markdown)));
  };
  const editor = useEditor({
    extensions: richMarkdownExtensions(),
    content: value, contentType: "markdown", immediatelyRender: false,
    editorProps: {
      attributes: { role: "textbox", "aria-multiline": "true", "aria-label": ariaLabel, "aria-describedby": ariaDescribedBy || "", spellcheck: String(spellCheck), tabindex: "0", class: "rich-markdown-content" },
      handleKeyDown: (_view, event) => { propsRef.current.onKeyDown?.(event); return event.defaultPrevented; },
      handlePaste: (_view, event) => {
        propsRef.current.onPaste?.(event);
        if (event.defaultPrevented) return true;
        const text = event.clipboardData?.getData("text/plain") || "";
        if (!event.clipboardData?.getData("text/html") && /(^|\n)(?:#{1,6} |[-*] |\d+\. |> |```)|\*\*|\$\$/.test(text)) {
          event.preventDefault();
          editorRef.current.commands.insertContent(text, { contentType: "markdown" });
          return true;
        }
        return false;
      },
    },
    onFocus: ({ editor }) => { propsRef.current.onFocus?.(); propsRef.current.onSelection?.(...selection(editor)); },
    onUpdate: ({ editor }) => {
      const markdown = preserveMarkdownBoundary(propsRef.current.value, editor.getMarkdown());
      emittedRef.current = markdown;
      propsRef.current.onChange(markdown);
    },
  }, []);
  editorRef.current = editor;

  useEffect(() => {
    if (!editor || emittedRef.current === value) return;
    editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
    emittedRef.current = value;
  }, [editor, value]);
  useEffect(() => {
    if (!editor) return undefined;
    const update = () => refresh((value) => value + 1);
    editor.on("transaction", update);
    return () => editor.off("transaction", update);
  }, [editor]);

  const applyFormat = (action) => {
    if (!editor) return false;
    const chain = editor.chain().focus();
    const commands = {
      heading: () => chain.toggleHeading({ level: 2 }).run(), bold: () => chain.toggleBold().run(), italic: () => chain.toggleItalic().run(),
      quote: () => chain.toggleBlockquote().run(), list: () => chain.toggleBulletList().run(), orderedList: () => chain.toggleOrderedList().run(),
      code: () => chain.toggleCodeBlock().run(), table: () => chain.insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run(),
    };
    if (action === "link") {
      linkSelection.current = editor.state.selection;
      setLinkDraft(editor.getAttributes("link").href || "https://");
      return true;
    }
    if (!commands[action]) return false;
    commands[action]();
    return true;
  };
  useImperativeHandle(ref, () => ({
    focus: () => editor?.commands.focus(),
    get selectionStart() { return editor ? selection(editor)[0] : value.length; },
    get selectionEnd() { return editor ? selection(editor)[1] : value.length; },
    setSelectionRange(start, end = start) {
      if (!editor) return;
      const normalized = editor.getMarkdown();
      const from = editorPosition(editor, mapTextOffset(value, normalized, start));
      const to = editorPosition(editor, mapTextOffset(value, normalized, end));
      editor.chain().focus().setTextSelection({ from, to: Math.max(from, to) }).run();
    },
    applyFormat,
  }));
  if (!editor) return <div className="rich-markdown-loading" role="status">正在加载编辑器…</div>;
  const heading = [1, 2, 3, 4, 5, 6].find((level) => editor.isActive("heading", { level })) || 0;
  const saveLink = () => {
    const href = linkDraft.trim();
    if (href && !/^(https?:\/\/|mailto:)/i.test(href)) return;
    editor.commands.setTextSelection(linkSelection.current);
    const chain = editor.chain().focus().extendMarkRange("link");
    if (href) chain.setLink({ href }).run(); else chain.unsetLink().run();
    setLinkDraft(null);
  };
  return <div className="rich-markdown-block">
    <div className="rich-block-controls" role="group" aria-label="段落与历史">
      <CustomSelect aria-label="段落样式" value={heading} onChange={(event) => { const level = Number(event.target.value); if (level) editor.chain().focus().setHeading({ level }).run(); else editor.chain().focus().setParagraph().run(); }}><option value={0}>正文</option>{[1, 2, 3, 4, 5, 6].map((level) => <option key={level} value={level}>标题 {level}</option>)}</CustomSelect>
      <button type="button" aria-label="撤销正文修改" disabled={!editor.can().undo()} onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().undo().run()}>↶</button>
      <button type="button" aria-label="重做正文修改" disabled={!editor.can().redo()} onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().redo().run()}>↷</button>
      <span>输入 # 加空格可写标题</span>
    </div>
    {linkDraft !== null ? <div className="rich-link-edit"><label>链接地址<input autoFocus aria-label="链接地址" value={linkDraft} onChange={(event) => setLinkDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); saveLink(); } }} /></label><button type="button" onClick={saveLink}>应用链接</button><button type="button" onClick={() => setLinkDraft(null)}>取消</button></div> : null}
    <div className={editor.isEmpty ? "rich-is-empty" : ""} data-placeholder={placeholder}><EditorContent editor={editor} /></div>
  </div>;
});
