import {
  forwardRef,
  lazy,
  Suspense,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "../lib/api";
import { ProtectedMarkdown } from "./ProtectedMarkdown";
import "../styles/rich-markdown.css";
import { manageableMediaRows } from "../lib/postMedia";
import { escapeLinkText, sourceLinkSelection } from "../lib/contentLinks";

const RichMarkdownBlock = lazy(() => import("./RichMarkdownBlock"));
const ContentLinkDialog = lazy(() => import("./ContentLinkDialog").then((module) => ({ default: module.ContentLinkDialog })));
const HeadingLinkWarnings = lazy(() => import("./HeadingLinkWarnings"));

function PendingLinkDialog({ onClose }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={dialogRef} className="content-link-dialog" aria-label="插入链接" onCancel={(event) => { event.preventDefault(); onClose(); }} onKeyDown={(event) => event.stopPropagation()}>
    <p role="status">正在准备链接选项…</p>
    <button type="button" className="btn btn-secondary" onClick={onClose}>取消</button>
  </dialog>;
}

function emitValue(onChange, value) {
  onChange?.({ target: { value } });
}

export const VisualMarkdownEditor = forwardRef(function VisualMarkdownEditor({
  value,
  media = [],
  management = false,
  className = "",
  placeholder = "",
  ariaLabel = "正文",
  ariaDescribedBy,
  spellCheck = true,
  onChange,
  onKeyDown,
  onPaste,
  onUpdateMedia,
  showSourcePreview = true,
  toolbar,
  toolbarEnd,
  postId,
}, ref) {
  const source = String(value || "");
  const rows = useMemo(() => manageableMediaRows(media), [media]);
  const mediaMap = useMemo(() => new Map(rows.map((row) => [Number(row.primary.id), row])), [rows]);
  const richEditorRef = useRef(null);
  const selectionRef = useRef([source.length, source.length]);
  const rawTextareaRef = useRef(null);
  const [sourceMode, setSourceMode] = useState(false);
  const [sourcePreview, setSourcePreview] = useState({ html: "", error: "", loading: false });
  const [previewRetry, setPreviewRetry] = useState(0);
  const [controlsHost, setControlsHost] = useState(null);
  const [linkDraft, setLinkDraft] = useState(null);
  const mediaContext = useMemo(() => ({ mediaMap, management, onUpdateMedia }), [mediaMap, management, onUpdateMedia]);

  useEffect(() => {
    if (!sourceMode || !showSourcePreview) return undefined;
    const controller = new AbortController();
    setSourcePreview((current) => ({ ...current, loading: true, error: "" }));
    const timer = window.setTimeout(async () => {
      try {
        const result = await api.post("/posts/preview", { body: source }, { signal: controller.signal });
        if (!controller.signal.aborted) setSourcePreview({ html: result.data.rendered_html || "", error: "", loading: false });
      } catch (error) {
        if (!controller.signal.aborted) setSourcePreview((current) => ({ ...current, error: error.message, loading: false }));
      }
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [sourceMode, showSourcePreview, source, previewRetry]);

  useImperativeHandle(ref, () => ({
    focus() {
      (sourceMode ? rawTextareaRef.current : richEditorRef.current)?.focus();
    },
    applyFormat(action) {
      if (sourceMode && action === "link") {
        const textarea = rawTextareaRef.current;
        const start = textarea?.selectionStart ?? source.length;
        const end = textarea?.selectionEnd ?? start;
        const pending = { ...sourceLinkSelection(source, start, end), sourceMode: true, preparing: true };
        setLinkDraft(pending);
        void import("../lib/headingAnchors").then(({ sourceHeadingInfo }) => {
          const headings = sourceHeadingInfo(source).headings.filter((heading) => heading.anchorOffset <= start || heading.anchorOffset >= end);
          setLinkDraft((current) => current === pending ? { ...pending, preparing: false, headings } : current);
        }).catch(() => setLinkDraft((current) => current === pending ? { ...pending, preparing: false, headings: [], headingError: "标题选项暂时无法加载，请关闭后重试。" } : current));
        return true;
      }
      return !sourceMode && (richEditorRef.current?.applyFormat(action) || false);
    },
    get selectionStart() {
      return (sourceMode ? rawTextareaRef.current : richEditorRef.current)?.selectionStart ?? selectionRef.current[0];
    },
    get selectionEnd() {
      return (sourceMode ? rawTextareaRef.current : richEditorRef.current)?.selectionEnd ?? selectionRef.current[1];
    },
    setSelectionRange(start, end = start) {
      selectionRef.current = [start, end];
      const editor = sourceMode ? rawTextareaRef.current : richEditorRef.current;
      editor?.focus();
      editor?.setSelectionRange(start, end);
    },
  }));

  const closeLink = () => {
    const fromSource = linkDraft?.sourceMode;
    setLinkDraft(null);
    window.requestAnimationFrame(() => (fromSource ? rawTextareaRef.current : richEditorRef.current)?.focus());
  };
  const applyLink = ({ href, text, heading }) => {
    if (linkDraft.sourceMode) {
      const insertion = href ? `[${escapeLinkText(text)}](${href.replace(/\(/g, "%28").replace(/\)/g, "%29")})` : escapeLinkText(text);
      const edits = [{ start: linkDraft.start, end: linkDraft.end, text: insertion }];
      const marker = heading && !heading.anchorId ? ` {#${heading.id}}` : "";
      if (marker) edits.push({ start: heading.anchorOffset, end: heading.anchorOffset, text: marker });
      let next = source;
      for (const edit of edits.sort((left, right) => right.start - left.start)) next = next.slice(0, edit.start) + edit.text + next.slice(edit.end);
      emitValue(onChange, next);
      const cursor = linkDraft.start + insertion.length + (marker && heading.anchorOffset <= linkDraft.start ? marker.length : 0);
      window.requestAnimationFrame(() => rawTextareaRef.current?.setSelectionRange(cursor, cursor));
    } else richEditorRef.current?.applyLink({ href, text, heading });
    closeLink();
  };

  return (
    <div className={`visual-markdown-editor ${className}${toolbar ? " has-commandbar" : ""}`}>
      <div className={toolbar ? "visual-markdown-commandbar" : undefined}>
      {toolbar ? <><div className="visual-rich-tools" ref={setControlsHost} hidden={sourceMode} />{toolbar}</> : null}
      <div className="visual-markdown-mode-switch" role="group" aria-label="正文编辑显示模式">
        <button type="button" aria-label="可视编辑" aria-pressed={!sourceMode} onClick={() => setSourceMode(false)}>可视编辑</button>
        <button type="button" aria-label="Markdown 源码" aria-pressed={sourceMode} onClick={() => setSourceMode(true)}>{toolbar ? "源码" : "Markdown 源码"}</button>
      </div>
      {toolbarEnd}
      </div>
      {source.includes("#ym-h-") ? <Suspense fallback={null}><HeadingLinkWarnings source={source} /></Suspense> : null}
      {linkDraft ? linkDraft.preparing ? <PendingLinkDialog onClose={closeLink} /> : <Suspense fallback={<PendingLinkDialog onClose={closeLink} />}><ContentLinkDialog draft={linkDraft} excludePostId={postId} onApply={applyLink} onRemove={() => applyLink({ href: "", text: linkDraft.text })} onClose={closeLink} /></Suspense> : null}
      <div hidden={!sourceMode} className={`visual-source-workspace ${showSourcePreview ? "has-preview" : ""}`}><textarea
          ref={rawTextareaRef}
          className="visual-markdown-source"
          value={source}
          spellCheck={spellCheck}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onSelect={(event) => { selectionRef.current = [event.currentTarget.selectionStart, event.currentTarget.selectionEnd]; }}
          placeholder={placeholder}
          aria-label={`${ariaLabel} Markdown 源码`}
          aria-describedby={ariaDescribedBy}
        />
        {showSourcePreview ? <section className="visual-source-preview" aria-label="Markdown 实时预览" aria-busy={sourcePreview.loading}>
          <header>实时预览 {sourcePreview.loading ? <span>正在更新…</span> : null}</header>
          {sourcePreview.error ? <div role="alert">{sourcePreview.error}<button type="button" onClick={() => setPreviewRetry((value) => value + 1)}>重试预览</button></div> : <ProtectedMarkdown html={sourcePreview.html} media={media} management={management} />}
        </section> : null}</div>
        <div hidden={sourceMode} className="visual-markdown-blocks" aria-label={`${ariaLabel}可视编辑区`}>
          <Suspense fallback={<div className="rich-markdown-loading" role="status">正在加载编辑器…</div>}>
            <RichMarkdownBlock
              ref={richEditorRef}
              value={source}
              mediaContext={mediaContext}
              controlsHost={controlsHost}
              spellCheck={spellCheck}
              onChange={(value) => emitValue(onChange, value)}
              onKeyDown={onKeyDown}
              onRequestLink={(draft) => setLinkDraft({ ...draft, sourceMode: false })}
              onPaste={onPaste}
              onSelection={(start, end) => { selectionRef.current = [start, end]; }}
              placeholder={placeholder}
              ariaLabel={ariaLabel}
              ariaDescribedBy={ariaDescribedBy}
            />
          </Suspense>
        </div>
    </div>
  );
});
