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

const RichMarkdownBlock = lazy(() => import("./RichMarkdownBlock"));

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

  return (
    <div className={`visual-markdown-editor ${className}`}>
      <div className="visual-markdown-mode-switch" role="group" aria-label="正文编辑显示模式">
        <button type="button" aria-pressed={!sourceMode} onClick={() => setSourceMode(false)}>可视编辑</button>
        <button type="button" aria-pressed={sourceMode} onClick={() => setSourceMode(true)}>Markdown 源码</button>
      </div>
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
              spellCheck={spellCheck}
              onChange={(value) => emitValue(onChange, value)}
              onKeyDown={onKeyDown}
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
