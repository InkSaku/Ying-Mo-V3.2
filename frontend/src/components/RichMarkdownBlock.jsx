import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CustomSelect } from "./CustomSelect";
import { useEditor, EditorContent, ReactNodeViewRenderer } from "@tiptap/react";
import { closeHistory } from "@tiptap/pm/history";
import { richMarkdownExtensions, markdownPosition, editorPosition, mapTextOffset } from "../lib/richMarkdown";
import { InternalMedia } from "../lib/internalMediaNode";
import { EditorMediaNode } from "./EditorMediaNode";
import { EditorMediaContext } from "../lib/editorMediaContext";
import { newHeadingAnchor } from "../lib/headingAnchors";

const mediaExtension = InternalMedia.extend({
  addNodeView: () => ReactNodeViewRenderer(EditorMediaNode, { trackNodeViewPosition: true }),
});

function restoreEditorSelection(editor, source, start, end) {
  const normalized = editor.getMarkdown();
  const from = editorPosition(editor, mapTextOffset(source, normalized, start));
  const to = editorPosition(editor, mapTextOffset(source, normalized, end));
  editor.chain().focus().setTextSelection({ from, to: Math.max(from, to) }).run();
}

export default forwardRef(function RichMarkdownBlock({ value, onChange, onSelection, onFocus, onKeyDown, onPaste, onRequestLink, placeholder, ariaLabel, ariaDescribedBy, spellCheck, mediaContext, controlsHost }, ref) {
  const propsRef = useRef({ value, onChange, onSelection, onFocus, onKeyDown, onPaste });
  propsRef.current = { value, onChange, onSelection, onFocus, onKeyDown, onPaste };
  const emittedRef = useRef(value);
  const editorRef = useRef(null);
  const pendingSelectionRef = useRef(null);
  const [, refresh] = useState(0);
  const linkSelection = useRef(null);
  const selection = (editor) => {
    const markdown = editor.getMarkdown();
    return [editor.state.selection.from, editor.state.selection.to].map((position) => mapTextOffset(markdown, propsRef.current.value, markdownPosition(editor, position, markdown)));
  };
  const editor = useEditor({
    extensions: richMarkdownExtensions(mediaExtension),
    content: value, contentType: "markdown", immediatelyRender: false,
    editorProps: {
      attributes: { role: "textbox", "aria-multiline": "true", "aria-label": ariaLabel, "aria-describedby": ariaDescribedBy || "", spellcheck: String(spellCheck), tabindex: "0", class: "rich-markdown-content" },
      handleKeyDown: (_view, event) => { propsRef.current.onKeyDown?.(event); return event.defaultPrevented; },
      clipboardTextSerializer: (slice) => editorRef.current.markdown.serialize({ type: "doc", content: slice.content.toJSON() }),
      handlePaste: (_view, event) => {
        propsRef.current.onPaste?.(event);
        if (event.defaultPrevented) return true;
        const text = event.clipboardData?.getData("text/plain") || "";
        if (!event.clipboardData?.getData("text/html") && /(^|\n)(?:#{1,6} |[-*] |\d+\. |> |```)|\*\*|\$\$|\[\[ym-media:\d+\]\]/.test(text)) {
          event.preventDefault();
          editorRef.current.commands.insertContent(text, { contentType: "markdown" });
          return true;
        }
        return false;
      },
    },
    onFocus: ({ editor }) => { propsRef.current.onFocus?.(); propsRef.current.onSelection?.(...selection(editor)); },
    onSelectionUpdate: ({ editor }) => propsRef.current.onSelection?.(...selection(editor)),
    onUpdate: ({ editor }) => {
      const markdown = editor.getMarkdown();
      emittedRef.current = markdown;
      propsRef.current.onChange(markdown);
    },
  }, []);
  editorRef.current = editor;

  useEffect(() => {
    if (!editor || emittedRef.current === value) return;
    let cancelled = false;
    // React node views flush their portals synchronously. Apply external source
    // changes after this lifecycle, preserving uploads as separate undo steps.
    queueMicrotask(() => {
      if (cancelled || editor.isDestroyed) return;
      editor.view.dispatch(closeHistory(editor.state.tr));
      editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
      editor.view.dispatch(closeHistory(editor.state.tr));
      emittedRef.current = value;
      if (pendingSelectionRef.current) {
        const [start, end] = pendingSelectionRef.current;
        pendingSelectionRef.current = null;
        restoreEditorSelection(editor, value, start, end);
      }
    });
    return () => { cancelled = true; };
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
      if (editor.isActive("link")) editor.commands.extendMarkRange("link");
      const { from, to } = editor.state.selection;
      linkSelection.current = { from, to };
      const headings = [];
      editor.state.doc.descendants((node, position) => {
        if (node.type.name === "heading" && node.textContent.trim()) headings.push({
          id: node.attrs.anchorId || newHeadingAnchor(), anchorId: node.attrs.anchorId,
          title: node.textContent, level: node.attrs.level, position,
        });
      });
      onRequestLink({ href: editor.getAttributes("link").href || "", text: editor.state.doc.textBetween(from, to, " "), headings });
      return true;
    }
    if (!commands[action]) return false;
    commands[action]();
    return true;
  };
  useImperativeHandle(ref, () => ({
    focus: () => queueMicrotask(() => { if (!editor?.isDestroyed) editor?.commands.focus(); }),
    get selectionStart() { return editor ? selection(editor)[0] : value.length; },
    get selectionEnd() { return editor ? selection(editor)[1] : value.length; },
    setSelectionRange(start, end = start) {
      queueMicrotask(() => {
        if (!editor || editor.isDestroyed) return;
        if (emittedRef.current !== propsRef.current.value) pendingSelectionRef.current = [start, end];
        else restoreEditorSelection(editor, propsRef.current.value, start, end);
      });
    },
    applyFormat,
    applyLink({ href, text, heading }) {
      if (!editor || editor.isDestroyed || !linkSelection.current) return;
      const { from, to } = linkSelection.current;
      editor.view.dispatch(closeHistory(editor.state.tr));
      const chain = editor.chain().focus().setTextSelection({ from, to });
      if (heading && !heading.anchorId) chain.command(({ tr }) => {
        const node = tr.doc.nodeAt(heading.position);
        if (node?.type.name !== "heading") return false;
        tr.setNodeMarkup(heading.position, undefined, { ...node.attrs, anchorId: heading.id });
        return true;
      });
      if (!href) chain.unsetLink().run();
      else if (from !== to && text === editor.state.doc.textBetween(from, to, " ")) chain.setLink({ href }).run();
      else {
        const marks = editor.state.doc.resolve(from).marks().filter((mark) => mark.type.name !== "link").map((mark) => mark.toJSON());
        chain.insertContent({ type: "text", text, marks: [...marks, { type: "link", attrs: { href } }] })
          .command(({ tr }) => { tr.removeStoredMark(editor.schema.marks.link); return true; }).run();
      }
      editor.view.dispatch(closeHistory(editor.state.tr));
    },
  }));
  if (!editor) return <div className="rich-markdown-loading" role="status">正在加载编辑器…</div>;
  const heading = [1, 2, 3, 4, 5, 6].find((level) => editor.isActive("heading", { level })) || 0;
  const controls = <div className="rich-block-controls" role="group" aria-label="段落与历史">
      <CustomSelect aria-label="段落样式" value={heading} onChange={(event) => { const level = Number(event.target.value); if (level) editor.chain().focus().setHeading({ level }).run(); else editor.chain().focus().setParagraph().run(); }}><option value={0}>正文</option>{[1, 2, 3, 4, 5, 6].map((level) => <option key={level} value={level}>标题 {level}</option>)}</CustomSelect>
      <button type="button" title="撤销" aria-label="撤销正文修改" disabled={!editor.can().undo()} onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().undo().run()}><svg viewBox="0 0 20 20" aria-hidden="true" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M7 5 3 9l4 4M3 9h8a5 5 0 0 1 0 10" transform="translate(0 -2)" /></svg></button>
      <button type="button" title="重做" aria-label="重做正文修改" disabled={!editor.can().redo()} onMouseDown={(event) => event.preventDefault()} onClick={() => editor.chain().focus().redo().run()}><svg viewBox="0 0 20 20" aria-hidden="true" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="m13 5 4 4-4 4m4-4H9a5 5 0 0 0 0 10" transform="translate(0 -2)" /></svg></button>
      <span>输入 # 加空格可写标题</span>
    </div>;
  return <div className="rich-markdown-block">
    {controlsHost ? createPortal(controls, controlsHost) : controls}
    <EditorMediaContext.Provider value={mediaContext || { mediaMap: new Map() }}>
      <div className={editor.isEmpty ? "rich-is-empty" : ""} data-placeholder={placeholder}><EditorContent editor={editor} /></div>
    </EditorMediaContext.Provider>
  </div>;
});
